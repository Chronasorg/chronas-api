FROM mongo

ENV MONGO_URI=mongodb://mongo-0.mongo,mongo-1.mongo:27017/chronas-api?
COPY dump /home/dump/
COPY entrypoint.sh /

ENTRYPOINT [ "/entrypoint.sh" ]