FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY question-repository.js ./
COPY public ./public
COPY data ./data
COPY data/question-bank-source.json ./question-bank-source.json
COPY tools ./tools
COPY question-import-template.csv ./

RUN npm run build

EXPOSE 5188

CMD ["node", "server.js"]
