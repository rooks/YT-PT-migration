require('dotenv').config({ silent: true })
require('./envcheck')

const argv        = require('yargs').argv
const fs          = require('fs')
const mkdirp      = require('mkdirp')
const _           = require('lodash')
const request     = require('request')
const parseString = require('xml2js').parseString
const queue       = require('queue')
const colors      = require('colors')

const common      = require('./common')

const projPath = common.projPath

const URL_BASE = `http://crossix.myjetbrains.com/youtrack`
const URL_LOGIN = `${URL_BASE}/rest/user/login`
const SIZE = 500

fetchIssues(argv.proj)

function fetchIssues(proj) {
    request.post({
        url: URL_LOGIN,
        form: {
            login: process.env.YT_LOGIN,
            password: process.env.YT_PASSWORD
        },
        jar: true // enable cookies
    }, (error, response, body) => {
        if (error || response.statusCode != 200) {
            console.error(`[login] status: ${response.statusCode}, error: ${error}`.red)
            console.log(body)
            return
        }

        fetchPart(proj, 0)
    })
}

const issues = []

function fetchPart(proj, part) {
    // create folder for peoject& attachments
    mkdirp.sync(projPath(proj, 'att'))

    const URL_ISSUES = `${URL_BASE}/rest/issue/byproject/${proj}?max=${SIZE}&after=${part*SIZE}`

    console.log(`[issues] fetching issues (${part*SIZE}-${(part+1)*SIZE})`)
    request.get({
        url: URL_ISSUES,
        jar: true
    }, (error, response, body) => {
        if (error || response.statusCode != 200) {
            console.log(`[issues] status: ${response.statusCode}, error: ${error}`.red)
            console.log(body)
            return
        }

        console.log(`[issues] fetched`)

        const partPath = projPath(proj, `issues-${part}.xml`)
        fs.writeFileSync(partPath, body)

        console.log(`[issues] saved to ${partPath}`)

        parseString(body, (err, result) => {
            const count = result.issues.issue.length
            console.log(`[issues] count: ${count}`)

            issues.push(...result.issues.issue)

            if (count == SIZE) {
                // fetch next part
                fetchPart(proj, part + 1)
            } else {
                // fetch attachments
                fetchAttachments(proj, issues)
            }
        })
    })
}

function fetchAttachments(proj, issues) {
    // grouped by issues
    const groups = _(issues)
        .map(iss => ({
            id: iss.$.id,
            field: _.find(iss.field, f => f.$.name == 'attachments')
        }))
        .filter(x => !!x.field)
        .map(x => ({
            id: x.id,
            att: _.map(x.field.value, v => ({
                name: v._,
                url: v.$.url
            }))
        }))
        .value()

    // create folder for each issue
    groups.forEach(x => {
        mkdirp.sync(projPath(proj, `att/${x.id}`))
    })

    // flatten all attachments
    const attachments = _(groups)
        .map(x => _.map(x.att, a => ({
            url: a.url,
            path: projPath(proj, `att/${x.id}/${a.name}`)
        })))
        .flatten()
        .value()

    console.log(`[attachments] count: ${attachments.length}`)

    const q = queue({
        concurrency: 4,
    })

    function getFetchJob(item) {
        return function (cb) {
            const url  = item.url
            const path = item.path
            const opts = {
                url,
                jar: true,
                encoding: null
            }

            request(opts)
                .on('response', response => {
                    const code = response.statusCode
                    console.log(`[attachments] code ${code}, url: ${url}`)

                    response
                        .pipe(fs.createWriteStream(path))
                        .on('finish', () => {
                            console.log(`[attachments] saved to ${path}`)
                            cb()
                        })
                })
        }
    }

    // add jobs
    q.push(...attachments.map(getFetchJob))

    q.start(err => {
        if (err) {
            console.log(`[attachments] error: ${err}`.red)
        }

        console.log('[attachments] finished')
    })
}
