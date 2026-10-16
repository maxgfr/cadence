declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

/** What Settings › About shows: the release and the commit this build came from. */
export const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev',
  commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev',
}
