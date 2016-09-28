require('dotenv').config({ silent: true })
require('./envcheck')

const argv        = require('yargs').argv
const _           = require('lodash')
const glob        = require('glob')
const fs          = require('fs')
const Q           = require('q')
const parseString = require('xml2js').parseString
const colors      = require('colors')

const common      = require('./common')

const text            = common.text
const date            = common.date
const convertTags     = common.convertTags
const convertType     = common.convertType
const convertEstimate = common.convertEstimate
const convertState    = common.convertState
const convertOwner    = common.convertOwner
const convertComments = common.convertComments
const destCols        = common.destCols
const projPath        = common.projPath

const parseXml = Q.denodeify(parseString)

const CHUNK_SIZE = argv.chunk || 300

build(argv.proj)

function build(proj) {
    const files = glob.sync(projPath(proj, 'issues-*.xml'))
        .map(file => fs.readFileSync(file))
        .map(xml => parseXml(xml))

    Q.all(files)
        .then(res => {
            const issues = _(res)
                .map(x => x.issues.issue)
                .flatten()
                .value()

            console.log(`[source] total issues found: ${issues.length}`)

            processIssues(proj, issues)
        })
        .catch(error => {
            console.log(`[error] ${error}`.red)
        })
}

function processIssues(proj, issues) {
    const raw = _.map(issues, iss => _(iss.field)
        .map(f => [f.$.name, f.value[0]])
        .concat([
            ['id', iss.$.id],
            ['tags', _.map(iss.tag, '_') || []],
            ['comments', _.map(iss.comment, '$') || []]
        ])
        .fromPairs()
        .value()
    )

    const items = _(raw)
        .map((x, i) => [
            // id
            x.numberInProject,
            // title
            text(x.summary),
            // labels, append old id as a label
            text(convertTags(x, [`chunk_${Math.floor(i/CHUNK_SIZE)}`])),
            // type
            text(convertType(x)),
            // estimate
            convertEstimate(x),
            // state
            text(convertState(x)),
            // created at
            text(date(x.created)),
            // accepted at
            text(date(x.resolved)),
            // deadline
            '',
            // requested by
            text(x.reporterFullName),
            // owned by
            text(convertOwner(x)),
            // description
            text(x.description),
            // comments
            ...convertComments(x)
        ])
        .value()

    const padCol = _.last(destCols)
    const maxLen = _.maxBy(items, 'length').length
    const cols = destCols.concat(
        _.times(maxLen - destCols.length, x => padCol)
    )

    _(items)
        .chunk(CHUNK_SIZE)
        .forEach((chunk, i) => {
            const res = _([cols])
                .concat(chunk)
                .map(x => x.join(','))
                .value()
                .join('\n')

            const chunkPath = projPath(proj, `issues_pt_${i}.csv`)
            fs.writeFileSync(chunkPath, res)

            console.log(`[dest] chunk: ${i}, size: ${chunk.length}, path: ${chunkPath}`)
        })
}
