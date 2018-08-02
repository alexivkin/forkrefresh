FROM node:10.5-slim

WORKDIR /forkrefresh
ENV NODE_ENV development

COPY package.json /forkrefresh/package.json

RUN npm install --production

COPY server.js /forkrefresh
COPY app/ /forkrefresh/app/
COPY lib/ /forkrefresh/lib/
COPY public/ /forkrefresh/public/

EXPOSE 8080

ENTRYPOINT ["node","server.js"]
