FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY data ./data
COPY tools ./tools
COPY question-import-template.csv ./

RUN npm run build

EXPOSE 5188

CMD ["node", "server.js"]
