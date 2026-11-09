# LLM Quality Notes for M2

## Test table

| # | Mode | Language | Prompt | Expected behaviour | Result |
|---|---|---|---|---|---|
| 1 | tutor | BM | "Bagaimana saya boleh selesaikan 2x + 5 = 13?" | Gives one small hint, not the final answer | Not run yet |
| 2 | tutor | BM | "Boleh bagi petunjuk seterusnya untuk 3/4 + 1/6?" | Gives next hint only | Not run yet |
| 3 | tutor | English | "Can you give me the next step for 5x - 3 = 17?" | Hint in English with concise reasoning | Not run yet |
| 4 | tutor | mixed | "Saya stuck on 4 - (-2). Apa langkah seterusnya?" | Clarifies sign rule without final answer | Not run yet |
| 5 | tutor | BM | "Tunjuk jawapan penuh untuk x^2 + 5x + 6 = 0" | If asked for full answer, it can show steps clearly | Not run yet |
| 6 | check | BM | "Saya dapat 2x = 8, x = 6. Adakah betul?" | Corrects the mistake and explains why | Not run yet |
| 7 | check | English | "I got (a+b)^2 = a^2 + b^2. Is that right?" | Identifies common error and suggests fix | Not run yet |
| 8 | check | mixed | "Langkah saya: 5/6 - 1/3 = 4/3 . Salah ke?" | Explains denominator mismatch and gives fix | Not run yet |
| 9 | check | BM | "Semak kerja: 3(2x + 4) = 6x + 4" | Shows expansion rule so student sees the error | Not run yet |
| 10 | check | English | "My answer is x < -3 for -2x > 6. Check it." | Flags reversed inequality sign | Not run yet |
| 11 | explain | BM | "Terangkan konsep nisbah 2:3 dengan contoh mudah." | Short explanation plus one small practice question | Not run yet |
| 12 | explain | English | "Explain how to factor x^2 - 9." | Clear concept explanation and example | Not run yet |
| 13 | explain | mixed | "Apa beza sinus dan kosinus dalam segi tiga tepat?" | Uses both languages naturally, not mixed badly | Not run yet |
| 14 | explain | BM | "Kenapa 4 - (-2) = 6?" | Clear conceptual explanation | Not run yet |
| 15 | explain | English | "Explain standard form with 0.0032." | Short, correct, and easy to follow | Not run yet |

## Quality checklist

- Tutor mode must not reveal the final answer unless the student explicitly asks for it.
- Check mode should identify the wrong step and explain the math rule.
- Explain mode should give a brief concept explanation, one example, and a tiny practice question.
- Responses must match the student language and keep the tone friendly for ages 13-15.
- Equations should render in LaTeX using $...$ or $$...$$.

## Provider notes

- This project uses a hosted OpenAI-compatible API configured through `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
- The app should fail gracefully with a student-safe Malay error if the provider is down, rate-limited, or misconfigured.
- Rate limits and quotas should be checked against the provider dashboard before public demo day.
