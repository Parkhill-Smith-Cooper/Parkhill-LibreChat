# Build from the repo root:
#   az acr build -r parkhilllibrechat -t pirros-proxy:<tag> -f parkhill/pirros-proxy/Dockerfile parkhill/pirros-proxy
FROM node:22.20.0-alpine
WORKDIR /app
COPY server.mjs main.mjs ./
USER node
ENV PIRROS_PROXY_PORT=8932
EXPOSE 8932
CMD ["node", "main.mjs"]
