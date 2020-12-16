"use strict"

function Playlist(name, items) {
	return {
		name: name,
		items: items
	}
}

function PlaylistItem(text, isHeader, location) {
	return {
		text: text,
		isHeader: isHeader,
		location: location
	}
}

function Presentation(name, groups) {
	return { 
		name: name, 
		groups: groups, 
		hash: function() { return hash(JSON.stringify(this)) } 
	}
}

function Group(name, color, slides) {
	return { 
		name: name, 
		color: color, 
		slides: slides 
	}
}

function Slide(text, previewImage) {
	return { 
		text: text, 
		previewImage: previewImage,
	}
}

function StageDisplaySlide(uid, text) {
	return {
		uid: uid,
		text: text
	}
}

function ProPresenterParser() {
	function parsePlaylistAndIndex(data, currentPresentationPath) {
		const currentLocation = currentPresentationPath.split(':')[0]
		const playlist = data.playlistAll.find(p => p.playlistLocation === currentLocation)
		if (!playlist) {
			return undefined
		}
		const newItems = playlist.playlist.map(function (item) {
			const isHeader = item.playlistItemType === 'playlistItemTypeHeader'
			return PlaylistItem(item.playlistItemName, isHeader, item.playlistItemLocation)
		})
		const newPlaylist = Playlist(playlist.playlistName, newItems)
		const currentIndex = newItems.findIndex(item => item.location === currentPresentationPath)
		return [newPlaylist, currentIndex]
	}
	
	function parsePresentation(data) {
		function asCSSColor(color) {
			return 'rgba(' + color.split(' ').map(c => c * 255).join(', ') + ')'
		}
		
		const presentation = data.presentation
		let presentationName = presentation.presentationName
		if (!presentationName) {
			presentationName = 'Presentation'
		}
		
		let newGroups = []
		for (const group of presentation.presentationSlideGroups) {
			let newSlides = []
			for (const slide of group.groupSlides) {
				newSlides.push(Slide(slide.slideText, slide.slideImage))
			}
			
			if (presentation.presentationSlideGroups.length == 1) {
				// TODO is this correct?
				for (let i = 0; i < group.groupSlides.length; i++) {
					const slide = group.groupSlides[i]
					const name = slide.slideLabel
					const groupColor = asCSSColor(slide.slideColor)
					newGroups.push(Group(name, groupColor, [newSlides[i]]))
				}
			} else {
				const groupColor = asCSSColor(group.groupColor)
				newGroups.push(Group(group.groupName, groupColor, newSlides))
			}
		}
		return Presentation(presentationName, newGroups) 
	}
	
	function parseStageDisplayCurrentAndNext(data) {
		let current = undefined
		let next = undefined
		for (const element of data.ary) {
			switch (element.acn) {
				case 'cs':
					current = StageDisplaySlide(element.uid, element.txt)
					break
				case 'ns':
					next = StageDisplaySlide(element.uid, element.txt)
					break
				default:
					// 'csn': current stage display slide notes
					// 'nsn': next stage display slide notes
					break
			}
		}
		return [current, next]
	}
	
	return {
		parsePlaylistAndIndex: parsePlaylistAndIndex,
		parsePresentation: parsePresentation,
		parseStageDisplayCurrentAndNext: parseStageDisplayCurrentAndNext
	}
}