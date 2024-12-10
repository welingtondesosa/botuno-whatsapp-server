# BotUno WhatsApp Server

Este servidor maneja la integración de WhatsApp para botuno.com usando WPPConnect.

## Configuración

1. Instala las dependencias:
```bash
npm install
```

2. Copia el archivo de ejemplo de variables de entorno:
```bash
cp .env.example .env
```

3. Configura las variables en el archivo `.env` con tus credenciales de Supabase.

## Desarrollo Local

```bash
npm run dev
```

## Producción

```bash
npm start
```

## Endpoints API

### POST /api/whatsapp/session
Inicia una nueva sesión de WhatsApp. Genera un código QR para escanear.

### GET /api/whatsapp/session
Obtiene el estado actual de la sesión y el código QR si está pendiente.

### POST /api/whatsapp/send
Envía un mensaje de WhatsApp.

### DELETE /api/whatsapp/session
Cierra la sesión de WhatsApp.

## Tablas Supabase Requeridas

### whatsapp_sessions
```sql
create table whatsapp_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id),
  qr_code text,
  status text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Políticas RLS
alter table whatsapp_sessions enable row level security;

create policy "Users can view their own sessions"
  on whatsapp_sessions for select
  using (auth.uid() = user_id);

create policy "Service role can manage all sessions"
  on whatsapp_sessions for all
  using (auth.role() = 'service_role');
```

### whatsapp_messages
```sql
create table whatsapp_messages (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id),
  message text,
  from text,
  to text,
  type text default 'RECEIVED',
  timestamp timestamp with time zone default timezone('utc'::text, now())
);

-- Políticas RLS
alter table whatsapp_messages enable row level security;

create policy "Users can view their own messages"
  on whatsapp_messages for select
  using (auth.uid() = user_id);

create policy "Service role can manage all messages"
  on whatsapp_messages for all
  using (auth.role() = 'service_role');
```

## Railway Deployment

1. Crea un nuevo proyecto en Railway
2. Conecta tu repositorio de GitHub
3. Configura las variables de entorno en Railway
4. Deploy!

## Monitoreo

Los logs se guardan en:
- `error.log`: Solo errores
- `combined.log`: Todos los logs

También puedes ver los logs en la consola durante el desarrollo.
