FROM denoland/deno:2.6.3
WORKDIR /app
COPY deno.json deno.lock ./
COPY src ./src
COPY drizzle ./drizzle
RUN deno cache src/main.ts && mkdir -p /data && chown deno:deno /data
USER deno
ENV DATABASE_URL=file:/data/tasks.db PORT=8000 UPLOAD_DIR=/data/uploads KV_PATH=/data/cache.sqlite
VOLUME ["/data"]
EXPOSE 8000
CMD ["run","--unstable-cron","--unstable-kv","--allow-net","--allow-read","--allow-write=/data","--allow-env","--allow-ffi","--allow-sys","src/main.ts"]
