const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const setupDatabase = async () => {
  try {
    // Crear tabla whatsapp_sessions
    const { error: sessionsError } = await supabase.rpc('create_whatsapp_sessions_table', {
      sql: `
        create table if not exists whatsapp_sessions (
          id uuid default uuid_generate_v4() primary key,
          user_id uuid references auth.users(id),
          qr_code text,
          status text,
          created_at timestamp with time zone default timezone('utc'::text, now()),
          updated_at timestamp with time zone default timezone('utc'::text, now())
        );

        -- Políticas RLS
        alter table whatsapp_sessions enable row level security;

        create policy if not exists "Users can view their own sessions"
          on whatsapp_sessions for select
          using (auth.uid() = user_id);

        create policy if not exists "Service role can manage all sessions"
          on whatsapp_sessions for all
          using (auth.role() = 'service_role');
      `
    });

    if (sessionsError) {
      console.error('Error creating whatsapp_sessions table:', sessionsError);
    } else {
      console.log('whatsapp_sessions table created successfully');
    }

    // Crear tabla whatsapp_messages
    const { error: messagesError } = await supabase.rpc('create_whatsapp_messages_table', {
      sql: `
        create table if not exists whatsapp_messages (
          id uuid default uuid_generate_v4() primary key,
          user_id uuid references auth.users(id),
          message text,
          from_number text,
          to_number text,
          type text default 'RECEIVED',
          timestamp timestamp with time zone default timezone('utc'::text, now())
        );

        -- Políticas RLS
        alter table whatsapp_messages enable row level security;

        create policy if not exists "Users can view their own messages"
          on whatsapp_messages for select
          using (auth.uid() = user_id);

        create policy if not exists "Service role can manage all messages"
          on whatsapp_messages for all
          using (auth.role() = 'service_role');
      `
    });

    if (messagesError) {
      console.error('Error creating whatsapp_messages table:', messagesError);
    } else {
      console.log('whatsapp_messages table created successfully');
    }

  } catch (error) {
    console.error('Error setting up database:', error);
  }
};

setupDatabase();
