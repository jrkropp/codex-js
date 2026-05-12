declare module "cloudflare:test" {
	// The Workers test package intentionally asks users to merge their generated Env.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}
