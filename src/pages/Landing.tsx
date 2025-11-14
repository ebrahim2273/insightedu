import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Camera, Users, BarChart3, Shield, ArrowRight } from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  const teamMembers = [
    {
      number: "01",
      name: "Ebrahim Naser Alnuaime",
      id: "2014023460",
      role: "Team Leader / Technical Lead"
    },
    {
      number: "02",
      name: "Easa Mohammed Alawadhi",
      id: "2013205696",
      role: "Developer / Communications"
    },
    {
      number: "03",
      name: "Hamad Sari Alketbi",
      id: "2012017156",
      role: "Color Designer / Data Manager"
    },
    {
      number: "04",
      name: "Ali Omar Alteniji",
      id: "2012046155",
      role: "Tester / Designer"
    }
  ];

  const features = [
    {
      icon: Camera,
      title: "AI-Powered Recognition",
      description: "Advanced facial recognition technology for accurate attendance tracking"
    },
    {
      icon: Users,
      title: "Student Management",
      description: "Comprehensive system to manage students, classes, and enrollments"
    },
    {
      icon: BarChart3,
      title: "Real-time Analytics",
      description: "Detailed insights and reports on attendance patterns and trends"
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "End-to-end encryption ensuring data privacy and security"
    }
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />

      <div className="relative z-10">
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-block mb-4">
              <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full border border-primary/20">
                <Camera className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">AI-Powered Attendance System</span>
              </div>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              InSight Dashboard
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed">
              Comprehensive AI Face Recognition Attendance System
            </p>
            
            <p className="text-lg text-muted-foreground/80 mb-10 max-w-2xl mx-auto">
              Transform attendance management with cutting-edge facial recognition technology. 
              Streamline your workflow, eliminate manual errors, and gain valuable insights into attendance patterns.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                onClick={() => navigate('/auth')}
                className="text-lg group"
              >
                Get Started
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-lg"
              >
                Learn More
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-lg text-muted-foreground">Everything you need for modern attendance management</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <Card 
                key={index}
                className="p-6 border-2 border-border/50 hover:border-primary/50 transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Team Section */}
        <section className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Insight Team
            </h2>
            <p className="text-lg text-muted-foreground">Meet the team behind the innovation</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {teamMembers.map((member, index) => (
              <Card 
                key={index}
                className="p-6 border-2 border-primary/30 bg-card/50 backdrop-blur-sm hover:border-primary transition-all duration-200 hover:-translate-y-1"
              >
                <div className="text-center">
                  <div className="text-5xl font-bold text-primary/80 mb-4">{member.number}</div>
                  <h3 className="text-lg font-bold mb-1 text-foreground">{member.name}</h3>
                  <p className="text-sm text-muted-foreground/70 mb-3 font-mono">{member.id}</p>
                  <p className="text-sm text-muted-foreground font-medium">{member.role}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="container mx-auto px-4 py-16 mb-16">
          <Card className="max-w-4xl mx-auto p-8 md:p-12 text-center border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join us in revolutionizing attendance management with AI-powered face recognition
            </p>
            <Button 
              size="lg" 
              onClick={() => navigate('/auth')}
              className="text-lg group"
            >
              Sign In / Sign Up
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default Landing;