import { Hero } from "@/components/hero";
import {
  Closing,
  Commands,
  Features,
  HowItWorks,
  Interlude,
  Intro,
} from "@/components/sections";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

const Home = () => (
  <>
    <SiteNav />
    <main>
      <Hero />
      <div className="border-gray-alpha-400 mx-auto max-w-[75rem] xl:border-x">
        <Intro />
        <HowItWorks />
        <Interlude />
        <Features />
        <Commands />
      </div>
      <Closing />
    </main>
    <SiteFooter />
  </>
);

export default Home;
