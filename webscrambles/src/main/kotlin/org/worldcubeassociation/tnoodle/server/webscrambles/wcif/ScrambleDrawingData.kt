package org.worldcubeassociation.tnoodle.server.webscrambles.wcif

import org.worldcubeassociation.tnoodle.server.model.EventData
import org.worldcubeassociation.tnoodle.server.webscrambles.wcif.model.ActivityCode
import org.worldcubeassociation.tnoodle.server.webscrambles.wcif.model.extension.FmcExtension
import org.worldcubeassociation.tnoodle.server.webscrambles.wcif.model.ScrambleSet
import org.worldcubeassociation.tnoodle.server.webscrambles.wcif.model.extension.SheetCopyCountExtension

// FIXME do we need some kind of "Scrambles for" prefix?
data class CompetitionDrawingData(val competitionTitle: String, val scrambleSheets: List<ScrambleDrawingData>)

data class ScrambleDrawingData(val scrambleSet: ScrambleSet, val activityCode: ActivityCode, val isStaging: Boolean = false) {
    val isFmc: Boolean
        get() = scrambleSet.findExtension<FmcExtension>()
            ?.isFmc ?: (activityCode.eventModel == EventData.THREE_FM)

    val numCopies: Int
        get() = scrambleSet.findExtension<SheetCopyCountExtension>()
            ?.numCopies ?: 1
}
