import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HuggingFaceInference } from "@langchain/community/llms/hf";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { TeamMember } from "../types/index.js";

export class AgentFactory {
  private model: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference;
  private teamAgents: Map<string, any>;
  private validationAgent: any;
  private routingAgent: any;

  constructor(model: ChatOpenAI | ChatGroq | ChatGoogleGenerativeAI | HuggingFaceInference) {
    this.model = model;
    this.teamAgents = new Map();
    this.initializeAgents();
  }

  private initializeAgents() {
    const teamMembers = this.getTeamMembers();

    // Initialize team agents
    teamMembers.forEach((member) => {
      const agent = createReactAgent({
        llm: this.model,
        tools: [],
      });
      this.teamAgents.set(member.role, agent);
    });

    // Initialize validation agent
    this.validationAgent = createReactAgent({
      llm: this.model,
      tools: [],
    });

    // Initialize routing agent
    this.routingAgent = createReactAgent({
      llm: this.model,
      tools: [],
    });
  }

  getTeamAgent(role: string) {
    return this.teamAgents.get(role);
  }

  getValidationAgent() {
    return this.validationAgent;
  }

  getRoutingAgent() {
    return this.routingAgent;
  }

  getTeamMembers(): TeamMember[] {
    return [
      {
        role: "Product Owner",
        name: "Sarah Chen",
        imageUrl: "https://i.pinimg.com/736x/61/1a/05/611a05c64cf1e18dd6b80ac1ee910f4f.jpg",
        personality: "Business-focused, decisive, user-centric",
        expertise: [
          "Business Analysis",
          "User Experience",
          "Product Strategy",
          "Stakeholder Communication",
        ],
        communicationStyle:
          "Direct and results-oriented, but approachable. Uses business language and focuses on value delivery.",
        workApproach:
          "Strategic thinker who always connects requirements back to business objectives and user value.",
        preferredFrameworks: [
          "User Story Mapping",
          "Impact Mapping",
          "Kano Model",
          "Business Model Canvas",
        ],
        detailedPersona: `Product manager with 8 years experience in educational technology. Passionate about improving student learning outcomes through innovative platform design and user-centered requirements.`,
      },
      
      {
        role: "Technical Lead",
        name: "Emma Thompson",
        personality: "Pragmatic, solution-oriented, quality-focused",
        expertise: [
          "System Architecture",
          "Technical Constraints",
          "Risk Assessment",
          "Performance Requirements",
          "Integration Patterns",
        ],
        communicationStyle:
          "Direct and practical. Translates technical concepts into business language and vice versa.",
        workApproach:
          "Focuses on feasibility and maintainability. Always considers long-term implications of technical decisions.",
        preferredFrameworks: [
          "TOGAF",
          "Risk Assessment Matrix",
          "Technical Debt Quadrant",
          "Architecture Decision Records",
          "Quality Attribute Scenarios",
        ],
        detailedPersona: `Senior software architect with 12 years experience building scalable educational platforms. Expert in cloud infrastructure, security compliance, and integrating learning management systems.`,
      },
      {
        role: "UX Designer",
        name: "David Park",
        personality: "Creative, user-empathetic, collaborative",
        expertise: [
          "User Research",
          "Interaction Design",
          "Usability",
          "Design Thinking",
          "Accessibility",
        ],
        communicationStyle:
          "Visual and story-driven. Often sketches ideas while talking and uses user scenarios to illustrate points.",
        workApproach:
          "User-centered design approach. Always advocates for the end user and believes good design solves real problems.",
        preferredFrameworks: [
          "Design Thinking",
          "User Journey Mapping",
          "Jobs-to-be-Done",
          "Usability Heuristics",
          "Accessibility Guidelines (WCAG)",
        ],
        detailedPersona: `UX designer with 7 years experience creating intuitive educational interfaces. Specializes in accessibility design and optimizing learning platform user experiences for diverse students.`,
      },
      {
        role: "Quality Assurance Lead",
        name: "Lisa Wang",
        personality: "Thorough, quality-focused, risk-aware",
        expertise: [
          "Testing Strategy",
          "Quality Metrics",
          "Requirements Validation",
          "Test Case Design",
          "Defect Management",
        ],
        communicationStyle:
          "Precise and analytical. Focuses on edge cases and potential failure scenarios.",
        workApproach:
          "Prevention-focused approach. Believes quality should be built in from the requirements phase, not tested in later.",
        preferredFrameworks: [
          "ISTQB Testing Principles",
          "Risk-Based Testing",
          "Boundary Value Analysis",
          "Requirements Testability Checklist",
          "Acceptance Criteria Templates",
        ],
        detailedPersona: `QA lead with 9 years experience testing educational software. Expert in FERPA compliance, accessibility testing, and ensuring learning platforms meet strict quality standards.`,
      },
      {
        role: "Student",
        name: "Sarah",
        imageUrl: "https://i.pinimg.com/736x/57/79/b2/5779b26270106fd7a9b200c3b97aa7a3.jpg",
        personality: "Curious, collaborative, student-focused",
        expertise: [
          "Student Perspective",
          "User Needs Assessment",
          "Learning Experience",
          "Student Requirements",
          "Educational Technology",
        ],
        communicationStyle:
          "Enthusiastic and relatable. Speaks from personal experience and helps bridge the gap between technical teams and student needs.",
        workApproach:
          "Advocates for student-centered design and ensures that solutions actually meet real student needs and learning objectives.",
        preferredFrameworks: [
          "Design Thinking",
          "User-Centered Design",
          "Persona Development",
          "Student Journey Mapping",
          "Learning Experience Design",
        ],
        detailedPersona: `Junior computer science student actively using learning platforms daily. Advocates for user-friendly educational technology that actually supports student success and learning outcomes.`,
      },
      {
        role: "Lecturer",
        name: "Julson",
        imageUrl: "https://i.pinimg.com/736x/7e/83/0e/7e830e9c49dee63d546ba2b376523d30.jpg",
        personality: "Knowledgeable, pedagogical, technology-embracing",
        expertise: [
          "Educational Technology",
          "Curriculum Design",
          "Student Learning Analytics",
          "Digital Learning Platforms",
          "Academic Requirements",
        ],
        communicationStyle:
          "Thoughtful and educational. Explains concepts clearly and relates technology to learning outcomes and student success.",
        workApproach:
          "Focuses on how technology can enhance learning experiences and improve educational outcomes for students.",
        preferredFrameworks: [
          "Bloom's Taxonomy",
          "Learning Management Systems",
          "Educational Technology Standards",
          "Instructional Design Models",
          "Student-Centered Learning",
        ],
        detailedPersona: `Computer science lecturer with 15 years experience integrating technology into education. Expert in learning management systems and improving student engagement through digital platforms.`,
      },
      {
        role: "Academic Advisor",
        name: "Kalle",
        imageUrl: "https://i.pinimg.com/736x/e1/4a/83/e14a8371f954ca9c153ba39cb4af9b87.jpg",
        personality: "Supportive, organized, student-focused",
        expertise: [
          "Student Support Services",
          "Academic Planning",
          "Campus Resources",
          "Student Success Strategies",
          "Educational Technology Integration",
        ],
        communicationStyle:
          "Empathetic and solution-oriented. Focuses on understanding student needs and connecting them with appropriate resources and support systems.",
        workApproach:
          "Takes a holistic view of student success, considering both academic and personal factors that impact learning and campus experience.",
        preferredFrameworks: [
          "Student Success Models",
          "Academic Intervention Strategies",
          "Campus Resource Mapping",
          "Student Support Systems",
          "Retention and Engagement Strategies",
        ],
        detailedPersona: `Academic advisor with 12 years experience supporting student success. Expert in connecting students with technology resources and identifying barriers to learning platform adoption.`,
      },
    ];
  }
}