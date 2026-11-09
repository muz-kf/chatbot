import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

export interface ThemedScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  autoHide?: boolean;
  thumbClassName?: string;
  trackClassName?: string;
  viewportClassName?: string;
}

export const ThemedScrollArea = forwardRef<HTMLDivElement, ThemedScrollAreaProps>(
  (
    {
      children,
      className = "",
      autoHide = false,
      thumbClassName = "",
      trackClassName = "",
      viewportClassName = "",
      ...props
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    const [thumbHeight, setThumbHeight] = useState(0);
    const [thumbTop, setThumbTop] = useState(0);
    const [isScrollable, setIsScrollable] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragStartYRef = useRef(0);
    const dragStartScrollTopRef = useRef(0);

    useImperativeHandle(ref, () => viewportRef.current as HTMLDivElement);

    const updateThumb = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const { clientHeight, scrollHeight, scrollTop } = viewport;
      const canScroll = scrollHeight > clientHeight + 2;
      setIsScrollable(canScroll);

      if (!canScroll) {
        setThumbHeight(0);
        return;
      }

      const trackHeight = clientHeight - 8;
      const calculatedThumbHeight = Math.max(
        24,
        Math.round((clientHeight / scrollHeight) * trackHeight),
      );
      setThumbHeight(calculatedThumbHeight);

      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbTop = trackHeight - calculatedThumbHeight;
      const calculatedThumbTop =
        maxScrollTop > 0
          ? Math.round((scrollTop / maxScrollTop) * maxThumbTop) + 4
          : 4;

      setThumbTop(calculatedThumbTop);
    }, []);

    const handleScroll = useCallback(() => {
      updateThumb();
      setIsScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 900);
    }, [updateThumb]);

    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      updateThumb();

      const observer = new ResizeObserver(() => {
        updateThumb();
      });
      observer.observe(viewport);

      const mutationObserver = new MutationObserver(() => {
        updateThumb();
      });
      mutationObserver.observe(viewport, { childList: true, subtree: true });

      return () => {
        observer.disconnect();
        mutationObserver.disconnect();
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      };
    }, [updateThumb]);

    const handleThumbPointerDown = (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartYRef.current = e.clientY;
      dragStartScrollTopRef.current = viewportRef.current?.scrollTop || 0;

      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleThumbPointerMove = (e: React.PointerEvent) => {
      if (!isDragging || !viewportRef.current) return;
      const deltaY = e.clientY - dragStartYRef.current;
      const viewport = viewportRef.current;
      const trackHeight = viewport.clientHeight - 8;
      const maxThumbTop = trackHeight - thumbHeight;
      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;

      if (maxThumbTop > 0) {
        const scrollDelta = (deltaY / maxThumbTop) * maxScrollTop;
        viewport.scrollTop = dragStartScrollTopRef.current + scrollDelta;
      }
    };

    const handleThumbPointerUp = (e: React.PointerEvent) => {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handleTrackClick = (e: React.MouseEvent) => {
      if (!viewportRef.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const trackHeight = rect.height;
      const percentage = Math.max(0, Math.min(1, clickY / trackHeight));
      const maxScrollTop =
        viewportRef.current.scrollHeight - viewportRef.current.clientHeight;
      viewportRef.current.scrollTo({
        top: percentage * maxScrollTop,
        behavior: "smooth",
      });
    };

    const showScrollbar =
      isScrollable && (!autoHide || isHovered || isScrolling || isDragging);

    return (
      <div
        ref={containerRef}
        className={`themed-scroll-area ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...props}
      >
        <div
          ref={viewportRef}
          className={`themed-scroll-viewport ${viewportClassName}`}
          onScroll={handleScroll}
        >
          {children}
        </div>

        {isScrollable && (
          <div
            ref={trackRef}
            className={`themed-scroll-track ${trackClassName} ${
              showScrollbar ? "is-visible" : ""
            }`}
            onClick={handleTrackClick}
          >
            <div
              className={`themed-scroll-thumb ${thumbClassName} ${
                isDragging ? "is-dragging" : ""
              }`}
              style={{
                height: `${thumbHeight}px`,
                transform: `translateY(${thumbTop}px)`,
              }}
              onPointerDown={handleThumbPointerDown}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
              onPointerCancel={handleThumbPointerUp}
            />
          </div>
        )}
      </div>
    );
  },
);

ThemedScrollArea.displayName = "ThemedScrollArea";

