module.exports = {
  apps: [{
    name: 'electricity-trading',
    script: 'server/dist/index.js',
    cwd: '/opt/electricity-trading',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    node_args: '--max-old-space-size=512',
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/electricity-trading/error.log',
    out_file: '/var/log/electricity-trading/out.log',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 5000,
    kill_timeout: 5000,
    watch: false,
  }],
};
