# take default image of node boron i.e  node 6.x
FROM node:9

# create app directory in container
RUN mkdir -p /app

# set /app directory as default working directory
WORKDIR /app

# only copy package.json initially so that `RUN npm start` layer is recreated only
# if there are changes in package.json
ADD dist/package.json /app/

ENV NODE_ENV=production

ENV JWT_SECRET=0a6b944d-d2fb-46fc-a85e-0295c986cd9f
ENV MONGO_HOST=mongodb://localhost/chronas-api
ENV MONGO_PORT=27017
ENV PORT=80
ENV TWITTER_CONSUMER_KEY=placeholder
ENV TWITTER_CONSUMER_SECRET=placeholder
ENV TWITTER_CALLBACK_URL=placeholder
ENV APPINSIGHTS_INSTRUMENTATIONKEY=b4bc70b7-b805-42c1-a3d4-c1e0e8d3af02
RUN npm install --production --silent

# copy all file from current dir to /app in container
COPY dist /app/

# expose port 4040
EXPOSE 80

# cmd to start service
CMD [ "node", "index.js" ]