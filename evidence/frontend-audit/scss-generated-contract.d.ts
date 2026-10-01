/** Test-only substitute for the SCSS module typings emitted by Heft. No styles or runtime are mocked. */
declare module '*.module.scss' { const classes: { [className: string]: string }; export default classes; }
