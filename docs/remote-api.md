# Remote APIs

Legacy DokuWiki XML-RPC, JSON-RPC, and OpenAPI compatibility is not required for the first Pages launch. The native port keeps those legacy entrypoints explicit so clients receive a stable `501 Not Implemented` response instead of an ambiguous 404.

- `/lib/exe/xmlrpc.php`: `501`
- `/lib/exe/jsonrpc.php`: `501`
- `/lib/exe/openapi.php`: `501`

Bearer-token API auth, CORS policy, and page/media/user API methods remain future work if remote API compatibility becomes a launch requirement.
