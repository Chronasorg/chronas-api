FROM keymetrics/pm2:latest
# create app directory in container
RUN mkdir -p /app
# set /app directory as default working directory
WORKDIR /app

# only copy package.json initially so that `RUN npm start` layer is recreated only
# if there are changes in package.json
ADD dist/package.json /app/
# copy all file from current dir to /app in container
COPY dist/. /app/

ENV JWT_SECRET=0a6b944d-d2fb-46fc-a85e-0295c986cd9f
ENV MONGO_HOST=mongodb://localhost/chronas-api
ENV MONGO_PORT=27017
ENV PORT=80

RUN npm install --production

# expose port 80
EXPOSE 80

CMD [ "pm2-docker", "start", "index.js" ]
