FROM krewh/hardened-nginx
COPY www /usr/share/nginx/html
COPY nginx-conf /etc/nginx/conf.d/sites