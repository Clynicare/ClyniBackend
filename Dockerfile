# Step 1: Specify the base image
FROM node:20

# Step 2: Set the working directory inside the container
WORKDIR /usr/src/app

# Step 3: Copy the package.json and package-lock.json files into the container
COPY package*.json ./

# Step 4: Install app dependencies inside the container
RUN npm install

# Step 5: Copy the rest of the application code into the container
COPY . .

# Step 6: Set the environment variables for MongoDB and Redis (if needed)
ENV MONGO_URL=mongodb+srv://syedakousar222:youjv72XqW9Inn8n@amreen.j1fof.mongodb.net/
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379

# Step 7: Expose the port your app will be running on
EXPOSE 7000

# Step 8: Define the command to run the app
CMD ["npm", "start"]
