
export default () => ({
  // Port where the orchestrator service will run
  port: parseInt(process.env.PORT || '3002', 10),

  // RabbitMQ connection configuration
  // Format: amqp://username:password@host:port
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    // Queue names for different notification channels
    queues: {
      email: process.env.EMAIL_QUEUE || 'email.queue',
      push: process.env.PUSH_QUEUE || 'push.queue',
    },
  },

  // External service URLs
  // These are the base URLs for services we need to call
  userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  templateServiceUrl:
    process.env.TEMPLATE_SERVICE_URL || 'http://localhost:3003',

  // JWT secret for validating tokens from API Gateway
  jwtSecret: process.env.JWT_SECRET || '',

  // Redis URL (optional, for caching if needed)
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
});
