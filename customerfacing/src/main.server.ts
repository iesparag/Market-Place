import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// The SSR engine passes a BootstrapContext — it MUST be forwarded to bootstrapApplication,
// otherwise the app boots on the browser platform on the server (→ "document is not defined").
const bootstrap = (context: BootstrapContext) => bootstrapApplication(AppComponent, config, context);

export default bootstrap;
