exports.config = { timeout: 30 };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { jobDescription, resumeText, tier, jurisdictions } = JSON.parse(event.body);

    if (!jobDescription || jobDescription.trim().length < 50) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Job description is too short to analyze.' })
      };
    }

    const isEmployer = tier === 'employer';
    const hasResume = resumeText && resumeText.trim().length > 50;

    let systemPrompt;
    let userContent;

    if (isEmployer) {
      systemPrompt = `You are an expert algorithmic bias auditor and employment law compliance specialist.
Analyze the provided job description for bias, discriminatory language, and compliance risk.
Return ONLY valid JSON with no markdown, no explanation, no preamble.
JSON structure:
{
  "federal_risk": "low|medium|high",
  "state_risk": "low|medium|high",
  "overall_risk": "low|medium|high",
  "summary": "2-3 sentence plain-language overview",
  "flags": [
    {
      "category": "category name",
      "jurisdiction": "federal|state|both",
      "excerpt": "exact quoted text from JD",
      "risk_level": "low|medium|high",
      "explanation": "why this is a problem",
      "remediation": "specific fix recommendation"
    }
  ],
  "jurisdiction_triggers": ["list of applicable laws"],
  "eeoc_exposure": "low|medium|high",
  "state_obligations": ["list of specific state AI obligations that apply regardless of risk level"]
}`;
      userContent = `Analyze this job description for an employer operating in these jurisdictions: ${jurisdictions || 'All US jurisdictions including EEOC federal guidelines'}\n\nJob Description:\n${jobDescription.substring(0, 4000)}`;

    } else if (hasResume) {
      systemPrompt = `You are an employment bias specialist and resume strategist helping job seekers understand why they may be screened out by ATS systems and biased job descriptions.
You will receive a job description and a resume. Analyze both together.
Return ONLY valid JSON with no markdown, no explanation, no preamble.
JSON structure:
{
  "overall_risk": "low|medium|high",
  "summary": "2-3 sentence overview of the candidate's situation",
  "jd_flags": [
    {
      "category": "bias category",
      "plain_language_explanation": "what bias exists in the JD",
      "what_this_means_for_you": "how this specific bias may affect this candidate based on their resume"
    }
  ],
  "resume_gaps": [
    {
      "issue": "specific gap or mismatch",
      "explanation": "why this likely triggers ATS rejection",
      "rewrite_suggestion": "specific language change to improve chances without misrepresenting"
    }
  ],
  "keyword_mismatches": [
    {
      "jd_term": "term used in JD",
      "resume_equivalent": "equivalent term found or missing in resume",
      "recommendation": "how to address this"
    }
  ],
  "action_steps": [
    "specific prioritized action"
  ]
}`;
      userContent = `JOB DESCRIPTION:\n${jobDescription.substring(0, 3000)}\n\nRESUME:\n${resumeText.substring(0, 3000)}`;

    } else {
      systemPrompt = `You are an employment bias specialist helping job seekers understand if a job description may be screening them out unfairly.
Analyze the provided job description and identify the top 3 bias concerns.
Return ONLY valid JSON with no markdown, no explanation, no preamble.
JSON structure:
{
  "overall_risk": "low|medium|high",
  "top_flags": [
    {
      "category": "category name",
      "plain_language_explanation": "simple explanation of the concern",
      "what_this_means_for_you": "practical impact for the job seeker"
    }
  ],
  "action_steps": [
    "specific recommended action"
  ]
}`;
      userContent = `Analyze this job description:\n\n${jobDescription.substring(0, 4000)}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', errText);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Analysis failed. Please try again.' })
      };
    }

    const data = await response.json();
    const rawText = data.content[0].text.trim();

    let result;
    try {
      result = JSON.parse(rawText);
    } catch(e) {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid JSON from Claude');
      }
    }

    result.mode = hasResume ? 'full' : 'jd-only';
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error('analyze-jd error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
