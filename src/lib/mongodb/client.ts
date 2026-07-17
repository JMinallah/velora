// Transitional shim: the connection now lives in the adapters layer
// (docs/02-ARCHITECTURE.md §3). Existing accessors import from here until
// Phase 1 moves them into src/domain.
export { getClient, getDb, closeClient } from "@/adapters/db"
