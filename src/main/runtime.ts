import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { Effect, ManagedRuntime, type PlatformError } from 'effect'

// One shared runtime bridges Effect programs to electron's promise-based ipc
// edge and provides the node-backed FileSystem service.
export const runtime = ManagedRuntime.make(NodeFileSystem.layer)

// A missing file or directory reads as the given fallback; every other
// platform error still fails.
export const orElseNotFound =
  <A2>(fallback: A2) =>
  <A, R>(
    self: Effect.Effect<A, PlatformError.PlatformError, R>
  ): Effect.Effect<A | A2, PlatformError.PlatformError, R> =>
    Effect.catchIf(
      self,
      (error) => error.reason._tag === 'NotFound',
      () => Effect.succeed(fallback)
    )
