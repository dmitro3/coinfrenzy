import { inngest } from '../inngest/client'

// Placeholder Inngest function — verifies the SDK is wired correctly.
// Trigger via the Inngest dev server with: `inngest.send({ name: 'hello/world' })`.
export const helloWorld = inngest.createFunction(
  { id: 'hello-world' },
  { event: 'hello/world' },
  async ({ event, step }) => {
    await step.run('greet', async () => {
      // eslint-disable-next-line no-console
      console.log('hello from inngest worker', event.data)
      return { greeted: true }
    })
    return { ok: true }
  },
)
