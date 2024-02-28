cat .env | fly secrets import
fly launch
fly deploy

fly scale count 1
fly deploy --ha=false
