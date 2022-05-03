FROM node:14.15.5-alpine
ENV NODE_ENV=production
WORKDIR /app
LABEL "network.forta.settings.agent-logs.enable"="true"
COPY bot-config.json ./
COPY ./src ./src
COPY ./abi ./abi
COPY package*.json ./
RUN npm ci --production
CMD [ "npm", "run", "start:prod" ]