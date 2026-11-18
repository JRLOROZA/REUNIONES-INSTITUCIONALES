// Datos de conexión con Supabase.
// Se rellenan con la "Project URL" y la clave "anon public" (o "publishable") del proyecto.
// Esta clave es pública por diseño: la seguridad la ponen el inicio de sesión
// y las reglas de acceso definidas en supabase/schema.sql.
// NUNCA pongas aquí la clave "service_role" ni ninguna clave "secret".
window.APP_CONFIG = {
  SUPABASE_URL: "https://dtxihznjlpzlzmbjhugg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_AhKw_V9xFGXx6THqbwAPQQ_DEqk8Ms3"
};
