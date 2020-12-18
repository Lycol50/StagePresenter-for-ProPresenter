function undefinedToEmpty(string) {
    if (string === undefined) {
        return "";
    }
    return string
}

function Scroller(container) {
    let scrollCounter = 0
    
    function scroll(deltaY, duration) {
        deltaY = 0 | deltaY
        if (deltaY === 0) {
            return
        }
        
        scrollCounter += 1
        const counter = scrollCounter
        
        const startMillis = Date.now()
        const startY = container.scrollTop
        
        function easeInOutQuad(t) {
            t /= duration / 2;
            if (t < 1) {
                return deltaY / 2 * t * t + startY
            }
            t--
            return -deltaY / 2 * (t * (t - 2) - 1) + startY
        }
        function linear(t) {
            return startY + (t / duration * deltaY)
        }
        
        function animateScroll() {
            if (counter !== scrollCounter) {
                // Abort, another scroll was issued
                return
            }
            
            const elapsedMillis = Date.now() - startMillis
            if (elapsedMillis < duration) {
                container.scrollTop = 0 | easeInOutQuad(elapsedMillis) 
                requestAnimationFrame(animateScroll)
            } else {
                container.scrollTop = startY + deltaY
            }
        }
        animateScroll();
        
    }
    
    function scrollTo(to, duration) {
        scroll(to - container.scrollTop, duration)
    }
    
    return {
        scroll: scroll,
        scrollTo: scrollTo
    }
}
