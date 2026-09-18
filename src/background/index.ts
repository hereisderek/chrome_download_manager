// Service worker entry point. Each import registers its own top-level
// listeners as a side effect - MV3 requires listeners to be registered
// synchronously at load time, so nothing here is deferred behind an init().
import "./downloadInterceptor.ts";
import "./messageRouter.ts";
