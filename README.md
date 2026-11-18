# Reuniones Institucionales

App para registrar y seguir las reuniones del departamento de Relaciones Institucionales de la Fundación Summa Humanitate. Se instala en el PC y en el móvil desde el navegador y deja consultar las reuniones también sin conexión.

- **App:** archivos estáticos (`index.html`, `css/`, `js/`), publicados con GitHub Pages.
- **Datos, inicio de sesión y adjuntos:** [Supabase](https://supabase.com), región UE (Fráncfort).
- En este repositorio **no se guardan datos de reuniones**, solo el código.

## Puesta en marcha (una sola vez)

### 1. Base de datos (Supabase)
1. En el proyecto de Supabase, abre **SQL Editor › New query**, pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
2. En **Authentication › Sign In / Providers**, desactiva **Allow new users to sign up**. Así solo entra quien des de alta tú.
3. En **Authentication › Users › Add user › Create new user**, crea tu usuario con email y contraseña y marca **Auto Confirm User**. Haz lo mismo para el Director General cuando quieras darle acceso.
4. En **Authentication › URL Configuration**, pon como **Site URL** la dirección de la app (paso 3) y añádela también en **Redirect URLs**. Esto hace falta para el enlace de "He olvidado mi contraseña".

### 2. Conexión
En [`js/config.js`](js/config.js) van la **Project URL** y la clave **anon public** del proyecto. Esa clave es pública por diseño. Nunca pongas ahí la clave `service_role` ni ninguna "secret".

### 3. Publicación (GitHub Pages)
En el repositorio, ve a **Settings › Pages**. En **Source** elige **Deploy from a branch**, en **Branch** elige la rama principal y la carpeta `/ (root)`, y pulsa **Save**. En uno o dos minutos la app queda en `https://jrloroza.github.io/REUNIONES-INSTITUCIONALES/`.

## Instalarla

- **PC (Chrome o Edge):** abre la dirección y pulsa **Instalar app** en la cabecera, o el icono de instalar de la barra de direcciones.
- **Android (Chrome):** pulsa **Instalar app**, o menú ⋮ › **Instalar aplicación**.
- **iPhone (Safari):** botón **Compartir** › **Añadir a pantalla de inicio**.

## Sin conexión

La app guarda en el dispositivo una copia de las reuniones cada vez que se sincroniza. Sin internet puedes consultarlas, pero registrar, editar y abrir adjuntos requiere conexión.

## Actualizar la app

Al cambiar archivos, sube el número de `VERSION` en `sw.js` para que los dispositivos instalados descarguen la versión nueva.
