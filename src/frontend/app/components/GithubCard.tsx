import { useEffect, useState } from "react";

type GitHubCardProps = {
  username: string;
  repo: string;
};

const GitHubCard = ({ username, repo }: GitHubCardProps) => {
  const [repoData, setRepoData] = useState<any>(null);

  useEffect(() => {
    const fetchRepo = async () => {
      const res = await fetch(`https://api.github.com/repos/${username}/${repo}`);
      const data = await res.json();
      setRepoData(data);
    };
    fetchRepo();
  }, [username, repo]);

  if (!repoData) {
    return (
      <div className="w-[350px] p-4 bg-neutral-900 rounded-xl text-white shadow-md animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <a
      href={repoData.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-[350px] p-4 bg-neutral-900 rounded-xl text-white shadow-md hover:shadow-lg transition-all border border-neutral-800"
    >
      <h3 className="text-xl font-semibold mb-2">{repoData.name}</h3>
      <p className="text-sm text-neutral-300 mb-3 line-clamp-3">{repoData.description}</p>
      <div className="flex justify-between text-sm text-neutral-400">
        <span>⭐ {repoData.stargazers_count}</span>
        <span>{repoData.language}</span>
        <span>🍴 {repoData.forks_count}</span>
      </div>
    </a>
  );
};

export default GitHubCard;
