const campusDiningRETasks = [
    // ============ STAKEHOLDER IDENTIFICATION & ANALYSIS ============
    {
        id: "stakeholder_identification_analysis",
        name: "Stakeholder Identification & Analysis",
        description: "Identify and analyze all stakeholders who will be affected by or can influence the Campus Smart Dining system",
        phase: "Requirements Discovery",
        objective: "Master stakeholder identification and analysis techniques",
        submissionEnvironment: "text-based",
        subtasks: [
            {
                id: "stakeholder_identification",
                name: "Stakeholder Identification",
                description: "Identify all individuals and groups who will be affected by or can influence the system",
                objective: "Learn to systematically identify primary, secondary, and key stakeholders",
                expectedOutcomes: [
                    "Comprehensive stakeholder list",
                    "Stakeholder categorization (primary/secondary/key)",
                    "Initial influence-interest matrix"
                ],
                validationCriteria: [
                    "Identifies at least 8 different stakeholder types",
                    "Covers both direct and indirect stakeholders",
                    "Includes technical and business stakeholders",
                    "Considers external stakeholders (parents, vendors)"
                ],
                deliverables: ["Stakeholder register", "Stakeholder map"],
                estimatedTime: "2-3 hours",
                difficulty: "Beginner",
                primaryAgent: "Stakeholder Analyst"
            },
            {
                id: "stakeholder_analysis",
                name: "Stakeholder Analysis & Prioritization",
                description: "Analyze stakeholder characteristics, needs, influence levels, and potential conflicts",
                objective: "Understand stakeholder power dynamics and prioritize engagement strategies",
                expectedOutcomes: [
                    "Detailed stakeholder profiles",
                    "Power-interest grid",
                    "Engagement strategy matrix",
                    "Conflict identification"
                ],
                validationCriteria: [
                    "Accurately assesses stakeholder influence levels",
                    "Identifies potential conflicts between stakeholders",
                    "Proposes appropriate engagement strategies",
                    "Considers stakeholder availability and expertise"
                ],
                deliverables: ["Stakeholder analysis report", "Engagement plan"],
                estimatedTime: "3-4 hours",
                difficulty: "Intermediate",
                primaryAgent: "Business Analyst"
            },
            {
                id: "persona_development",
                name: "User Persona Development",
                description: "Create detailed user personas based on stakeholder analysis",
                objective: "Learn to create representative user archetypes for requirements elicitation",
                expectedOutcomes: [
                    "3-5 detailed user personas",
                    "User journey maps",
                    "Pain points and motivations",
                    "Usage scenarios"
                ],
                validationCriteria: [
                    "Personas are based on real stakeholder data",
                    "Covers diverse user types and needs",
                    "Includes relevant demographic and behavioral details",
                    "Clearly articulates user goals and frustrations"
                ],
                deliverables: ["User persona documents", "Journey maps"],
                estimatedTime: "4-5 hours",
                difficulty: "Intermediate",
                primaryAgent: "UX Researcher"
            }
        ]
    },
    // ============ FUNCTIONAL REQUIREMENTS ============
    {
        id: "functional_requirements",
        name: "Functional Requirements",
        description: "Gather, analyze, and document functional requirements for the Campus Smart Dining system",
        phase: "Requirements Specification",
        objective: "Master functional requirements engineering techniques",
        submissionEnvironment: "text-based",
        subtasks: [
            {
                id: "requirements_elicitation",
                name: "Requirements Elicitation",
                description: "Gather functional requirements through stakeholder interviews and workshops",
                objective: "Master various elicitation techniques to extract stakeholder needs",
                expectedOutcomes: [
                    "Raw requirements list",
                    "Interview transcripts/notes",
                    "Workshop outcomes",
                    "Observation findings"
                ],
                validationCriteria: [
                    "Uses multiple elicitation techniques",
                    "Covers all major stakeholder groups",
                    "Captures both explicit and implicit needs",
                    "Documents assumptions and constraints"
                ],
                deliverables: ["Requirements gathering report", "Stakeholder feedback"],
                estimatedTime: "5-6 hours",
                difficulty: "Intermediate",
                primaryAgent: "Requirements Analyst"
            },
            {
                id: "functional_requirements_specification",
                name: "Functional Requirements Specification",
                description: "Document detailed functional requirements for the dining system core features",
                objective: "Learn to write clear, testable, and complete functional requirements",
                expectedOutcomes: [
                    "Structured functional requirements document",
                    "Use cases and user stories",
                    "System behavior specifications",
                    "Input/output definitions"
                ],
                validationCriteria: [
                    "Requirements follow standard format (shall statements)",
                    "Each requirement is testable and unambiguous",
                    "Covers all major system functions",
                    "Includes acceptance criteria"
                ],
                deliverables: ["Functional Requirements Document", "Use case diagrams"],
                estimatedTime: "6-8 hours",
                difficulty: "Intermediate",
                primaryAgent: "Systems Analyst"
            },
            {
                id: "user_story_creation",
                name: "User Story Creation & Refinement",
                description: "Transform requirements into user stories with acceptance criteria for agile development",
                objective: "Learn agile requirements documentation techniques",
                expectedOutcomes: [
                    "Epic breakdown structure",
                    "Detailed user stories",
                    "Acceptance criteria",
                    "Story point estimates"
                ],
                validationCriteria: [
                    "Stories follow standard format (As a... I want... So that...)",
                    "Includes clear acceptance criteria",
                    "Stories are independent and testable",
                    "Properly sized for development iterations"
                ],
                deliverables: ["User story backlog", "Epic roadmap"],
                estimatedTime: "4-5 hours",
                difficulty: "Beginner to Intermediate",
                primaryAgent: "Agile Coach"
            },
            {
                id: "business_rules_definition",
                name: "Business Rules Definition",
                description: "Identify and document business rules governing the dining system operations",
                objective: "Learn to separate business logic from functional requirements",
                expectedOutcomes: [
                    "Business rules catalog",
                    "Decision tables",
                    "Workflow definitions",
                    "Policy constraints"
                ],
                validationCriteria: [
                    "Rules are clearly separated from requirements",
                    "Covers payment, ordering, and operational policies",
                    "Uses decision tables for complex logic",
                    "Identifies rule sources and ownership"
                ],
                deliverables: ["Business Rules Document", "Decision tables"],
                estimatedTime: "3-4 hours",
                difficulty: "Intermediate",
                primaryAgent: "Business Process Analyst"
            }
        ]
    },
    // ============ NON-FUNCTIONAL REQUIREMENTS ============
    {
        id: "non_functional_requirements",
        name: "Non-Functional Requirements",
        description: "Identify and specify quality attributes, performance, security, and usability requirements",
        phase: "Requirements Specification",
        objective: "Master non-functional requirements specification techniques",
        submissionEnvironment: "text-based",
        subtasks: [
            {
                id: "nfr_identification",
                name: "Non-Functional Requirements Identification",
                description: "Identify quality attributes and constraints for the dining system",
                objective: "Learn to recognize and categorize non-functional requirements",
                expectedOutcomes: [
                    "NFR categories list",
                    "Quality attribute scenarios",
                    "Constraint identification",
                    "Stakeholder quality expectations"
                ],
                validationCriteria: [
                    "Covers all major NFR categories",
                    "Links NFRs to business drivers",
                    "Identifies measurable quality attributes",
                    "Considers system constraints"
                ],
                deliverables: ["NFR identification matrix", "Quality scenarios"],
                estimatedTime: "3-4 hours",
                difficulty: "Intermediate",
                primaryAgent: "Quality Assurance Specialist"
            },
            {
                id: "performance_requirements",
                name: "Performance Requirements Specification",
                description: "Define specific performance metrics and scalability requirements",
                objective: "Learn to specify measurable performance criteria",
                expectedOutcomes: [
                    "Response time requirements",
                    "Throughput specifications",
                    "Scalability targets",
                    "Load testing criteria"
                ],
                validationCriteria: [
                    "Metrics are specific and measurable",
                    "Covers peak load scenarios",
                    "Includes performance testing requirements",
                    "Addresses different user load patterns"
                ],
                deliverables: ["Performance Requirements Document"],
                estimatedTime: "2-3 hours",
                difficulty: "Intermediate",
                primaryAgent: "Performance Engineer"
            },
            {
                id: "security_requirements",
                name: "Security Requirements Analysis",
                description: "Define security requirements including authentication, authorization, and data protection",
                objective: "Learn to identify and specify security requirements",
                expectedOutcomes: [
                    "Security requirements list",
                    "Threat model",
                    "Compliance requirements",
                    "Data protection policies"
                ],
                validationCriteria: [
                    "Addresses authentication and authorization",
                    "Covers data encryption and privacy",
                    "Includes compliance requirements (PCI DSS, FERPA)",
                    "Considers threat scenarios"
                ],
                deliverables: ["Security Requirements Document", "Threat model"],
                estimatedTime: "4-5 hours",
                difficulty: "Advanced",
                primaryAgent: "Security Specialist"
            },
            {
                id: "usability_requirements",
                name: "Usability & Accessibility Requirements",
                description: "Define user experience requirements including accessibility standards",
                objective: "Learn to specify user-centered design requirements",
                expectedOutcomes: [
                    "Usability metrics",
                    "Accessibility standards",
                    "User interface guidelines",
                    "User experience criteria"
                ],
                validationCriteria: [
                    "Includes measurable usability goals",
                    "Addresses accessibility standards (WCAG)",
                    "Covers diverse user needs",
                    "Specifies user experience metrics"
                ],
                deliverables: ["Usability Requirements Document", "Accessibility checklist"],
                estimatedTime: "3-4 hours",
                difficulty: "Intermediate",
                primaryAgent: "UX Designer"
            }
        ]
    },
    // ============ REQUIREMENTS VALIDATION ============
    {
        id: "requirements_validation",
        name: "Requirements Validation",
        description: "Validate requirements through reviews, prototypes, and acceptance criteria definition",
        phase: "Requirements Validation",
        objective: "Master requirements validation and verification techniques",
        submissionEnvironment: "text-based",
        subtasks: [
            {
                id: "requirements_review",
                name: "Requirements Review & Inspection",
                description: "Conduct systematic review of requirements documents for completeness and quality",
                objective: "Learn formal review techniques for requirements quality assurance",
                expectedOutcomes: [
                    "Review checklist results",
                    "Defect identification",
                    "Quality metrics",
                    "Improvement recommendations"
                ],
                validationCriteria: [
                    "Uses systematic review process",
                    "Identifies ambiguous or incomplete requirements",
                    "Applies quality criteria consistently",
                    "Documents review findings clearly"
                ],
                deliverables: ["Review report", "Requirements quality metrics"],
                estimatedTime: "3-4 hours",
                difficulty: "Intermediate",
                primaryAgent: "Quality Assurance Specialist"
            },
            {
                id: "requirements_validation_planning",
                name: "Requirements Validation Planning",
                description: "Develop validation strategy and test cases for requirements verification",
                objective: "Learn to plan comprehensive requirements validation activities",
                expectedOutcomes: [
                    "Validation strategy document",
                    "Test case outlines",
                    "Validation techniques selection",
                    "Validation schedule"
                ],
                validationCriteria: [
                    "Covers multiple validation techniques",
                    "Maps test cases to requirements",
                    "Includes stakeholder validation activities",
                    "Considers validation feasibility"
                ],
                deliverables: ["Validation plan", "Test case specifications"],
                estimatedTime: "4-5 hours",
                difficulty: "Advanced",
                primaryAgent: "Test Manager"
            },
            {
                id: "prototype_validation",
                name: "Prototype-based Validation",
                description: "Create mockups/prototypes to validate requirements with stakeholders",
                objective: "Learn to use prototypes for requirements validation",
                expectedOutcomes: [
                    "Interactive mockups",
                    "Stakeholder feedback",
                    "Requirements refinements",
                    "Validation results"
                ],
                validationCriteria: [
                    "Prototype covers key user scenarios",
                    "Gathers meaningful stakeholder feedback",
                    "Identifies requirements gaps or conflicts",
                    "Results in requirements improvements"
                ],
                deliverables: ["Prototype demos", "Validation feedback report"],
                estimatedTime: "6-8 hours",
                difficulty: "Advanced",
                primaryAgent: "UX Designer"
            },
            {
                id: "acceptance_criteria_definition",
                name: "Acceptance Criteria Definition",
                description: "Define specific, testable acceptance criteria for all requirements",
                objective: "Learn to create measurable acceptance criteria",
                expectedOutcomes: [
                    "Detailed acceptance criteria",
                    "Test scenarios",
                    "Definition of Done",
                    "Verification methods"
                ],
                validationCriteria: [
                    "Criteria are specific and testable",
                    "Covers both functional and non-functional aspects",
                    "Includes positive and negative test cases",
                    "Stakeholders agree on criteria"
                ],
                deliverables: ["Acceptance criteria document", "Test scenarios"],
                estimatedTime: "4-5 hours",
                difficulty: "Intermediate",
                primaryAgent: "Product Owner"
            }
        ]
    },
    // ============ REQUIREMENTS MANAGEMENT ============
    {
        id: "requirements_management",
        name: "Requirements Management",
        description: "Manage requirements traceability, changes, and maintain requirements integrity throughout the project",
        phase: "Requirements Management",
        objective: "Learn requirements management best practices and tools",
        submissionEnvironment: "text-based",
        subtasks: [
            {
                id: "requirements_traceability",
                name: "Requirements Traceability Matrix",
                description: "Create traceability links between stakeholder needs, requirements, and test cases",
                objective: "Learn to maintain requirements traceability throughout the project",
                expectedOutcomes: [
                    "Traceability matrix",
                    "Forward and backward links",
                    "Impact analysis capability",
                    "Coverage analysis"
                ],
                validationCriteria: [
                    "Links requirements to source stakeholder needs",
                    "Traces requirements to design and test cases",
                    "Enables impact analysis for changes",
                    "Demonstrates complete coverage"
                ],
                deliverables: ["Traceability matrix", "Coverage report"],
                estimatedTime: "3-4 hours",
                difficulty: "Intermediate",
                primaryAgent: "Configuration Manager"
            },
            {
                id: "requirements_change_management",
                name: "Requirements Change Management",
                description: "Simulate requirements changes and manage the change control process",
                objective: "Learn to handle requirements changes systematically",
                expectedOutcomes: [
                    "Change request forms",
                    "Impact analysis",
                    "Change approval decisions",
                    "Updated requirements"
                ],
                validationCriteria: [
                    "Follows formal change control process",
                    "Analyzes impact on scope, schedule, and cost",
                    "Involves appropriate stakeholders in decisions",
                    "Maintains requirements integrity"
                ],
                deliverables: ["Change requests", "Impact analysis reports"],
                estimatedTime: "2-3 hours",
                difficulty: "Intermediate",
                primaryAgent: "Project Manager"
            },
            {
                id: "requirements_baseline_management",
                name: "Requirements Baseline Management",
                description: "Establish and maintain requirements baselines for controlled development",
                objective: "Learn baseline management and version control for requirements",
                expectedOutcomes: [
                    "Requirements baseline document",
                    "Version control strategy",
                    "Baseline approval process",
                    "Change impact tracking"
                ],
                validationCriteria: [
                    "Establishes clear baseline criteria",
                    "Implements version control procedures",
                    "Defines approval workflows",
                    "Tracks changes against baseline"
                ],
                deliverables: ["Baseline documents", "Version control logs"],
                estimatedTime: "2-3 hours",
                difficulty: "Intermediate",
                primaryAgent: "Configuration Manager"
            }
        ]
    }
];
// Export for use in platform
export default campusDiningRETasks;
