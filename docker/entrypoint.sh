#!/bin/sh
set -e

echo "Esperando PostgreSQL..."

until node -e "
const net = require('net');
const raw = process.env.DATABASE_URL || '';
const match = raw.match(/@([^/:]+)(?::(\d+))?/);
if (!match) process.exit(1);
const host = match[1];
const port = Number(match[2] || 5432);
const socket = net.createConnection({ host, port }, () => {
  socket.end();
  process.exit(0);
});
socket.on('error', () => process.exit(1));
"; do
  sleep 2
done

echo "Aplicando migraciones..."
if [ "${DATABASE_READ_ONLY:-false}" = "true" ]; then
  echo "DATABASE_READ_ONLY=true — se omiten migraciones y seed (Odoo producción)."
else
  npx prisma migrate deploy

  if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "Cargando datos iniciales..."
    npx tsx prisma/seed.ts
  fi
fi

echo "Iniciando aplicación..."
exec "$@"
