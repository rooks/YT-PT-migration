require('dotenv').config({ silent: true })
require('./envcheck')

const argv    = require('yargs').argv
const fs      = require('fs')
const path    = require('path')
const glob    = require('glob')
const request = require('request')
const Q       = require('q')
const _       = require('lodash')
const common  = require('./common')
const queue   = require('queue')
const colors  = require('colors')

const projPath = common.projPath

const req = Q.denodeify(request)

const PROJECT_ID = argv.ptProj
const HEADERS = {
    'X-TrackerToken': process.env.PT_API_TOKEN
}

upload(argv.proj)

function upload(proj) {
    const dirs = glob.sync(projPath(proj, 'att/*'))

    const q = queue({
        concurrency: 1,
    })

    const dirsToUp = dirs

    // add jobs
    q.push(...dirsToUp.map(getPostJob))

    q.start(err => {
        if (err) {
            console.log(`[attachments] error: ${err}`.red)
        }

        console.log('[attachments] finished')
    })
}

function getPostJob(dir) {
    return function (cb) {
        const id = dir.match(/[^/]+$/)[0].toLowerCase()
        const files = glob.sync(path.join(dir, '*'))
        let storyId = null

        console.log('=============================')
        console.log(`[story] YT id ${id}`)

        // search for story
        const xxx = req({
            url: `https://www.pivotaltracker.com/services/v5/projects/${PROJECT_ID}/search`,
            qs: {
                query: `"Imported from https://crossix.myjetbrains.com/youtrack/issue/${id.toUpperCase()}" includedone:true`
            },
            headers: HEADERS
        })
        // upload files
        .then(res => {
            console.log(`[story] search - status: ${res[0].statusCode}, label: ${id}`)

            const data = JSON.parse(res[1])

            if (!data.stories.stories.length) {
                console.error(`[story] story not found for label ${id}`.red)
                cb()
                throw 'story not found'
            }

            storyId = data.stories.stories[0].id

            console.info(`[story] found ${storyId} for label ${id}`)

            return Q.all(files.map(file => {
                // export TOKEN='your Pivotal Tracker API token'
                // export FILE_PATH='/home/vader/art-projects/new-imperial-logo-6.jpg'
                // export PROJECT_ID=99
                // curl -X POST -H "X-TrackerToken: $TOKEN" -F file=@"$FILE_PATH" "https://www.pivotaltracker.com/services/v5/projects/$PROJECT_ID/uploads"

                console.log(`[attachments] uploading file: ${file}`)
                return req({
                    url: `https://www.pivotaltracker.com/services/v5/projects/${PROJECT_ID}/uploads`,
                    method: 'POST',
                    headers: HEADERS,
                    formData: {
                        file: fs.createReadStream(file)
                    }
                })
            }))
        })
        // post comment
        .then(results => {
            const res = results
                .map(res => ({
                    code: res[0].statusCode,
                    att: JSON.parse(res[1])
                }))

            res.forEach(res => {
                console.log(`[attachments] upload - status: ${res.code}, file: ${res.att.filename}`)
            })

            return req({
                url: `https://www.pivotaltracker.com/services/v5/projects/${PROJECT_ID}/stories/${storyId}/comments`,
                method: 'POST',
                json: true,
                headers: HEADERS,
                body: {
                    text: 'Imported attachments',
                    file_attachments: res.map(x => x.att)
                }
            })
        })
        .then(res => {
            console.log(`[comment] status: ${res[0].statusCode}, story: ${storyId}`)
            cb()
        })
        .catch(error => {
            console.error(`[comment] failed: ${error}`.red)
        })
    }
}
