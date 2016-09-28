const colors  = require('colors')

const vars = [
    'YT_LOGIN',
    'YT_PASSWORD',
    'PT_API_TOKEN',
    'PT_DEFAULT_USER'
]

const notSet = vars.filter(x => !process.env[x])

notSet.forEach(x => {
    console.log(`env variable is not set - ${x}`.red)
})

if (notSet.length)
    process.exit(1)
