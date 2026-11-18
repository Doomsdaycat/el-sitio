# Image Docker de Brumeland VTT, pour l'installer sur un autre serveur.
# Pas de tunnel ici : le serveur hôte fournit l'adresse publique (proxy HTTPS).
#
#   docker build -t brumeland-vtt .
#   docker run -d --name brumeland --restart unless-stopped -p 3000:3000 \
#     -v brumeland-donnees:/app/data \
#     -e BRUMELAND_ADRESSE=https://vtt.exemple.fr \
#     brumeland-vtt
#
# Première ouverture : la page propose d'importer une partie (export .zip) ou d'en commencer une.
# Lien MJ : docker exec brumeland npm run -s lien-mj
# Le serveur s'arrête avec le code 75 après un import : il doit être relancé (--restart, Kubernetes).

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run -s compiler

ENV NODE_ENV=production \
    PORT=3000 \
    BRUMELAND_BASE=/app/data/brumeland.db

# La base de données vit dans ce dossier : à monter sur un volume pour qu'elle survive.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
EXPOSE 3000

USER node
CMD ["node", "--import", "tsx", "--disable-warning=ExperimentalWarning", "server/index.ts"]
