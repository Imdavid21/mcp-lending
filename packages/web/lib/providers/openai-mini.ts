import { OpenAIProvider } from "./openai";

export class OpenAIMiniProvider extends OpenAIProvider {
  protected model = "gpt-4o-mini";
}
