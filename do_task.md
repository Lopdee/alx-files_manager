# TASk step by step

## task 0

```bash
# test to see that node is working 
npx nodemon --exec babel-node --presets @babel/preset-env redis.js
# teminal 1
npm run dev ./utils/redis.js
# terminal2
redis-cli ping #output:  pong

# start doing it redis 
npm run dev ./utils/use_db/0_main.js
```


## task 1
```bash
# test to see that node is working 
npx nodemon --exec babel-node --presets @babel/preset-env db.js
# teminal 1
npm run dev ./utils/db.js

# start doing it mongo
npm run dev ./utils/use_db/1_main.js
```