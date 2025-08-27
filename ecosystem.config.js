module.exports = {
  apps: [
    // TypeScript Services
    {
      name: 'auth-service',
      cwd: './auth-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3001,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'api-gateway',
      cwd: './api-gateway',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3000,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'user-service',
      cwd: './user-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3003,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'query-service',
      cwd: './query-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 4000,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'event-processor',
      cwd: './event-processor',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3005,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'notification-service',
      cwd: './notification-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3006,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'scheduler-service',
      cwd: './scheduler-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3007,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'command-service',
      cwd: './command-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3008,
        NODE_ENV: 'development'
      }
    },
    
    // Frontend
    {
      name: 'partner-dashboard',
      cwd: './partner-dashboard',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3002,
        NODE_ENV: 'development'
      }
    },
    
    // Python ML Service
    {
      name: 'ml-service',
      cwd: './ml-service',
      script: 'python',
      args: 'src/main.py',
      interpreter: './venv/bin/python',
      env: {
        PORT: 8001,
        PYTHONPATH: '.'
      }
    }
  ]
};