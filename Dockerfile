# Use an official Node.js runtime as a parent image
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Set the working directory
WORKDIR /usr/src/app

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Install any needed packages specified in package.json
RUN npm install
# catch any ts errors now
RUN npx tsc

ENV PORT_TPLINK=7201
# Make port 3000 available to the world outside this container
EXPOSE ${PORT_TPLINK}

# Define environment variable
#ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright/

# Run the API on container startup
CMD ["npm", "start"]
