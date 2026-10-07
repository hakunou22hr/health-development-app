FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
COPY shared ./shared
RUN npm run build
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
USER node
EXPOSE 8787
CMD ["node", "server/index.mjs"]
