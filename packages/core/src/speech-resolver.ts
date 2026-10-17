export * as SpeechResolver from "./speech-resolver.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { ProviderConfigurationError, type SpeechModel } from "@opencode/ai"
import { ConfigModel } from "@opencode/schema/config/model"
import { Context, Effect, Layer, Schema, Struct } from "effect"
import { Npm } from "@opencode/util/npm"
import { Config } from "./config.js"
import { Credential } from "./credential.js"
import { Integration } from "./integration.js"
import { Model, type RuntimeInfo } from "./model.js"
import {
  InitializationPhase,
  VariantUnavailableError,
  causeMessage,
  nativeCredentialSettings,
  prepareProviderSettings,
  prepareRuntimeModel,
  withVariant,
} from "./model-resolver.js"
import { Provider } from "./provider.js"

export class UnsupportedPackageError extends Schema.TaggedError<UnsupportedPackageError>()(
  "SpeechResolver.UnsupportedPackageError",
  {
    providerID: Provider.ID,
    modelID: Model.ID,
    package: Schema.String,
  },
) {
  override get message() {
    return `Unsupported package for ${this.providerID}/${this.modelID}: ${this.package}`
  }
}

export class ModelConfigurationError extends Schema.TaggedError<ModelConfigurationError>()(
  "SpeechResolver.ModelConfigurationError",
  {
    providerID: Provider.ID,
    modelID: Model.ID,
    package: Schema.String,
    detail: Schema.String,
  },
) {
  override get message() {
    return `Cannot initialize ${this.providerID}/${this.modelID}: ${this.detail}`
  }
}

export class ModelInitializationError extends Schema.TaggedError<ModelInitializationError>()(
  "SpeechResolver.ModelInitializationError",
  {
    providerID: Provider.ID,
    modelID: Model.ID,
    package: Schema.String,
    phase: InitializationPhase,
    detail: Schema.String,
  },
) {
  override get message() {
    return `Cannot initialize ${this.providerID}/${this.modelID}: ${this.detail}`
  }
}

export class UnresolvedProviderVariablesError extends Schema.TaggedError<UnresolvedProviderVariablesError>()(
  "SpeechResolver.UnresolvedProviderVariablesError",
  {
    providerID: Provider.ID,
    modelID: Model.ID,
    variables: Schema.Array(Schema.String),
  },
) {
  override get message() {
    return `Cannot initialize ${this.providerID}/${this.modelID}: ${this.variables.join(", ")} ${this.variables.length === 1 ? "is" : "are"} required to resolve the provider endpoint`
  }
}

export type Error =
  | VariantUnavailableError
  | UnsupportedPackageError
  | ModelConfigurationError
  | ModelInitializationError
  | UnresolvedProviderVariablesError
  | Integration.AuthorizationError

export interface Resolved {
  /** Route-level speech model for provider requests. */
  readonly model: SpeechModel
  readonly providerID: Provider.ID
  /** Provider API model id, which may differ from the catalog id. */
  readonly modelID: string
  /** Configured voice default; per-request voice wins. */
  readonly voice?: string
  /** Configured format default; per-request format wins. */
  readonly format?: string
}

export interface Interface {
  readonly resolve: (requested?: ConfigModel.Selection) => Effect.Effect<Resolved | undefined, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SpeechResolver") {}

/** Resolves the configured `speech.model` selection into a runtime speech model for the current Location. */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const providers = yield* Provider.Service
    const models = yield* Model.Service
    const integrations = yield* Integration.Service
    const npm = yield* Npm.Service

    return Service.of({
      resolve: Effect.fn("SpeechResolver.resolve")(function* (requested?: ConfigModel.Selection) {
        const configured = Config.latest(yield* config.entries(), "speech")
        const selection = requested ?? configured?.model
        if (!selection) return undefined
        const selected = yield* models.get(selection.providerID, selection.model)
        if (!selected) return undefined
        const variant = yield* withVariant(selected, selection.variant)
        const provider = yield* providers.get(selected.providerID)
        const connection = yield* integrations.connection.active(
          provider?.integrationID ?? Integration.ID.make(selected.providerID),
        )
        const credential = connection ? yield* integrations.connection.resolve(connection) : undefined
        const runtimeInfo: RuntimeInfo = {
          ...variant,
          settings: Provider.mergeOverlay(provider?.settings, Provider.modelSettings(variant.settings)),
        }
        const model = yield* fromCatalogModel(runtimeInfo, credential, npm)
        return {
          model,
          providerID: selected.providerID,
          modelID: runtimeInfo.modelID ?? runtimeInfo.id,
          voice: configured?.voice,
          format: configured?.format,
        }
      }),
    })
  }),
)

const fromCatalogModel = Effect.fn("SpeechResolver.fromCatalogModel")(function* (
  model: RuntimeInfo,
  credential: Credential.Value | undefined,
  npm: Npm.Interface,
) {
  const resolved = prepareRuntimeModel(model)
  const configuration = credential?.type === "key" ? credential.configuration : undefined
  const configured = { ...resolved.settings, ...credential?.metadata, ...configuration }
  const specifier = Provider.packageName(resolved.package)
  if (!specifier) return yield* unsupported(resolved)
  const mapped = yield* prepareProviderSettings(resolved, Provider.nativeSettings(configured)).pipe(
    Effect.catchTag("SessionRunnerModel.UnresolvedProviderVariablesError", (error) =>
      Effect.fail(
        new UnresolvedProviderVariablesError({
          providerID: error.providerID,
          modelID: error.modelID,
          variables: error.variables,
        }),
      ),
    ),
  )
  const module = yield* Provider.loadSpeechPackage(specifier, npm).pipe(
    Effect.mapError((error) => initialization(resolved, "load", error.cause)),
  )
  const settings = {
    ...(credential ? Struct.omit(mapped, ["accessToken", "apiKey", "authToken"]) : mapped),
    ...(resolved.canonical === undefined ? {} : { provider: resolved.canonical }),
    ...nativeCredentialSettings(resolved, specifier, credential),
    headers: resolved.headers,
    body: resolved.body,
  }
  return yield* Effect.try({
    try: () => module.speech(resolved.modelID ?? resolved.id, settings),
    catch: (cause) =>
      cause instanceof ProviderConfigurationError
        ? new ModelConfigurationError({
            providerID: resolved.providerID,
            modelID: resolved.id,
            package: resolved.package ?? "unknown",
            detail: cause.message,
          })
        : initialization(resolved, "construct", cause),
  })
})

const unsupported = (model: RuntimeInfo) =>
  new UnsupportedPackageError({
    providerID: model.providerID,
    modelID: model.id,
    package: model.package ?? "unknown",
  })

const initialization = (model: RuntimeInfo, phase: InitializationPhase, cause: unknown) =>
  new ModelInitializationError({
    providerID: model.providerID,
    modelID: model.id,
    package: model.package ?? "unknown",
    phase,
    detail: causeMessage(cause) ?? `${phase} failed for ${model.package ?? "unknown"}`,
  })

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Provider.node, Model.node, Integration.node, Npm.node],
})
