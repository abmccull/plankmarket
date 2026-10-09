/** Prepare explicit dependencies omitted by a selected-schema pg_dump. */
export function prepareSchemaRestore(schema, extensions) {
  const boundary = "CREATE SCHEMA public;";
  if (schema.split(boundary).length !== 2) {
    throw new Error("Schema restore preparation requires one public schema creation boundary");
  }
  const seen = new Set();
  const dependencies = extensions.map(extension => {
    if (!["pg_trgm", "pgcrypto", "uuid-ossp"].includes(extension.extname) ||
        !["public", "extensions"].includes(extension.schema) ||
        !/^[a-zA-Z0-9._-]+$/.test(extension.extversion) || seen.has(extension.extname)) {
      throw new Error("Unsupported or duplicate schema extension metadata");
    }
    seen.add(extension.extname);
    return `CREATE EXTENSION "${extension.extname}" WITH SCHEMA "${extension.schema}" VERSION '${extension.extversion}';`;
  });
  return schema.replace(boundary, `${boundary}\n\n-- Explicit captured extension dependencies for a fresh local restore.\n${dependencies.join("\n")}\n`);
}
