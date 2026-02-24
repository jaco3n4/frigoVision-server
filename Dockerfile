FROM node:20-slim

WORKDIR /app

# Copier les manifestes en premier pour optimiser le cache des layers
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copier le reste du code source
COPY . .

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "src/server.js"]
