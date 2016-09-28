const path   = require('path')
const moment = require('moment')

const EPIC = 'epic'

function text(str) {
    const val = (str || '')
        .replace(/"/g, '""')
    return val ? `"${val}"` : val
}

function date(str) {
    return str ? moment(+str).format('MM/DD/YYYY') : ''
}

function convertTags(item, extra) {
    if (item.tags.includes(EPIC))
        return item.tags.filter(tag => tag != EPIC).join(',')

    return item.tags
        .concat(extra)
        .filter(tag => tag != EPIC)
        // .concat([item.id])
        .join(',')
}

function convertType(item) {
    if (item.tags.includes(EPIC))
        return EPIC

    switch (item.Type) {
        case 'Bug'      :
        case 'Exception': return 'bug'
        default         : return 'feature'
    }
}

function convertEstimate(item) {
    if (convertType(item) == 'feature') {
        return 1
    }

    return 0
}

function convertState(item) {
    if (item.resolved)
        return 'accepted'

    switch (item.Stage) {
        case 'Review'     : return 'unstarted'
        case 'Development': return 'started'
        case 'QA'         : return 'delivered'
        case 'Complete'   : return 'accepted'
    }

    return 'unscheduled'
}

function convertOwner(item) {
    if (item.Assignee) {
        return item.Assignee.$.fullName
    }
    return ''
}

function comment(cm, author, time) {
    return text(`${cm} (${author} - ${time})`)
}

function convertComments(item) {
    return item.comments
        .map(x =>
            comment(x.text, x.authorFullName, date(x.created))
        )
        .concat([
            comment(
                `Imported from https://crossix.myjetbrains.com/youtrack/issue/${item.id}`,
                process.env.PT_DEFAULT_USER,
                moment().format('MM/DD/YYYY')
            )
        ])
}

// path relative to the project dir
function projPath(proj, rest) {
    return path.join(`./data/proj-${proj}/`, rest)
}


const destCols = [
    'Id',
    'Title',
    'Labels',
    'Type', //  Feature, bug, chore, epic, release (required if importing epics)
    'Estimate',
    'Current State', // Unscheduled, unstarted, started, finished, delivered, accepted, rejected
    'Created at',
    'Accepted at',
    'Deadline',
    'Requested By',
    'Owned By',
    'Description',
    'Comment'
]

module.exports = {
    text,
    date,
    convertTags,
    convertType,
    convertEstimate,
    convertState,
    convertOwner,
    convertComments,
    destCols,
    projPath
}
