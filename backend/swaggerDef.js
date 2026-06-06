const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Hospital Room Booking API',
    version: '1.0.0',
    description: 'API for hospital room booking and allotment system',
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

module.exports = swaggerDefinition;